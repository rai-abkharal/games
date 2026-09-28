package com.swipeplay.app.bundles

import android.os.Process
import java.io.BufferedOutputStream
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.URL
import java.net.URLDecoder
import java.net.URLEncoder
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.ThreadFactory

/**
 * A loopback HTTP origin for locally stored games.
 *
 * Why a server at all, when the files are right there on disk:
 *
 *  - `file://` is not an option. Fifteen of the shipped games load their code
 *    with `<script type="module" crossorigin>`, and module scripts are fetched
 *    under CORS rules that an opaque `file://` origin can never satisfy. They
 *    would simply stop running.
 *  - `loadDataWithBaseURL` (what the in-memory prefetch path uses) gives the
 *    document a synthetic origin with its own quirks, and it cannot serve the
 *    assets beside the document at all.
 *
 * Served over `http://127.0.0.1:<port>/<token>/...`, a game sees exactly the
 * same kind of origin it saw when it came from the real server, so module
 * scripts, `fetch`, fonts, audio and `localStorage` all behave unchanged.
 *
 * Two details matter for correctness rather than speed:
 *
 *  - **The port is sticky.** `localStorage` is keyed by origin, and the origin
 *    contains the port, so a port that moved between launches would silently
 *    wipe every game's saved progress. The chosen port is remembered in the
 *    store's index and reused.
 *  - **The path carries a secret token.** Any app on the device can reach
 *    127.0.0.1; without the token they could enumerate and read the store.
 *    The token is not part of the origin, so it does not affect saved state.
 *    It is persisted alongside the port rather than regenerated per process,
 *    because every URL contains it and a token that moved invalidated the
 *    WebView's HTTP cache — and V8's compiled-code cache with it — on every
 *    single launch. Re-parsing a megabyte-plus engine bundle from scratch was
 *    a larger, more certain cost than the narrow replay window a rotating
 *    token closed.
 *
 * Activated builds are cacheable under their content-addressed URL. A live
 * file or still-staging build is sent `no-store` until the complete build has
 * passed the downloader's manifest checks and activation.
 */
class LocalGameServer(
  private val store: GameBundleStore,
  private val tutorialRoot: File,
  private val liveCacheRoot: File,
) {

  /** Only builds explicitly selected by the app may fetch missing files. */
  private val liveVersions = ConcurrentHashMap<String, String>()
  private val liveFileLocks = ConcurrentHashMap<String, Any>()

  @Volatile private var socket: ServerSocket? = null
  @Volatile private var acceptor: Thread? = null

  /** Unguessable, and stable across launches so cached resources stay valid. */
  val token: String get() = store.pathToken

  var port: Int = 0
    private set

  private var workers: java.util.concurrent.ExecutorService = newWorkerPool()

  private fun newWorkerPool(): java.util.concurrent.ExecutorService =
    Executors.newFixedThreadPool(
      8,
      ThreadFactory { runnable ->
        Thread({
          Process.setThreadPriority(Process.THREAD_PRIORITY_DEFAULT)
          runnable.run()
        }, "local-game-server").apply { isDaemon = true }
      },
    )

  fun isRunning(): Boolean = socket?.isClosed == false

  @Synchronized
  fun start(): Boolean {
    if (isRunning()) return true
    if (workers.isShutdown) workers = newWorkerPool()
    val loopback = InetAddress.getByName("127.0.0.1")
    val preferred = store.preferredPort
    val candidates = ArrayList<Int>()
    if (preferred in 1024..65535) candidates.add(preferred)
    // A deterministic ladder before falling back to an OS-assigned port, so a
    // reinstall or a cleared index usually lands on the same origin as before.
    for (offset in 0 until 24) candidates.add(DEFAULT_PORT + offset)
    candidates.add(0)

    for (candidate in candidates) {
      try {
        val server = ServerSocket(candidate, 32, loopback)
        server.reuseAddress = true
        socket = server
        port = server.localPort
        store.rememberPort(port)
        val thread = Thread({ acceptLoop(server) }, "local-game-acceptor")
        thread.isDaemon = true
        acceptor = thread
        thread.start()
        return true
      } catch (_: IOException) {
        // Port taken by something else; try the next one.
      }
    }
    return false
  }

  @Synchronized
  fun stop() {
    try {
      socket?.close()
    } catch (_: IOException) {
      /* ignore */
    }
    socket = null
    acceptor?.interrupt()
    acceptor = null
    workers.shutdownNow()
  }

  /** The URL a WebView should load for an activated build. */
  fun entryUrl(gameId: String, buildId: String, entry: String): String =
    "http://127.0.0.1:$port/$token/$gameId/$buildId/$entry"

  /** The live URL is identical to the eventual disk URL, preserving WebView storage. */
  fun prepareLive(gameId: String, version: String, buildId: String, entry: String): String? {
    if (!gameId.matches(SAFE_ID) || !buildId.matches(SAFE_ID) ||
      !version.matches(SAFE_VERSION) || !GameBundleStore.isSafeRelativePath(entry) ||
      !entry.endsWith(".html", ignoreCase = true)) return null
    liveVersions["$gameId|$buildId"] = version
    return entryUrl(gameId, buildId, entry)
  }

  private fun acceptLoop(server: ServerSocket) {
    Process.setThreadPriority(Process.THREAD_PRIORITY_DEFAULT)
    while (!server.isClosed) {
      val client = try {
        server.accept()
      } catch (_: IOException) {
        return
      }
      try {
        workers.execute { serve(client) }
      } catch (_: Exception) {
        try {
          client.close()
        } catch (_: IOException) {
          /* ignore */
        }
      }
    }
  }

  private fun serve(client: Socket) {
    try {
      client.tcpNoDelay = true
      client.soTimeout = 15_000
      val input = client.getInputStream().buffered()
      val output = BufferedOutputStream(client.getOutputStream(), 64 * 1024)
      // Keep-alive: a game pulls dozens of small files, and a fresh connection
      // for each one would add avoidable latency to every load.
      while (!client.isClosed) {
        if (!handleRequest(input, output)) break
        output.flush()
      }
      output.flush()
    } catch (_: Exception) {
      /* a dropped connection is normal */
    } finally {
      try {
        client.close()
      } catch (_: IOException) {
        /* ignore */
      }
    }
  }

  /** @return true to keep the connection open for another request. */
  private fun handleRequest(input: InputStream, output: OutputStream): Boolean {
    val requestLine = readLine(input) ?: return false
    if (requestLine.isEmpty()) return false
    val parts = requestLine.split(" ")
    if (parts.size < 3) {
      writeStatus(output, 400, "Bad Request")
      return false
    }
    val method = parts[0].uppercase()
    val rawTarget = parts[1]

    var rangeHeader: String? = null
    var keepAlive = parts[2].contains("1.1")
    while (true) {
      val header = readLine(input) ?: return false
      if (header.isEmpty()) break
      val colon = header.indexOf(':')
      if (colon <= 0) continue
      val name = header.substring(0, colon).trim().lowercase()
      val value = header.substring(colon + 1).trim()
      when (name) {
        "range" -> rangeHeader = value
        "connection" -> keepAlive = !value.equals("close", ignoreCase = true)
        "content-length" -> {
          // No request bodies are expected; drain to keep the stream aligned.
          val length = value.toLongOrNull() ?: 0L
          var remaining = length
          val scratch = ByteArray(8 * 1024)
          while (remaining > 0) {
            val read = input.read(scratch, 0, minOf(scratch.size.toLong(), remaining).toInt())
            if (read <= 0) break
            remaining -= read
          }
        }
      }
    }

    if (method != "GET" && method != "HEAD") {
      writeStatus(output, 405, "Method Not Allowed")
      return false
    }

    if (rawTarget.contains("preview-adapter.js")) {
      val payload = "/* no-op adapter */".toByteArray(Charsets.UTF_8)
      val headers = linkedMapOf(
        "Content-Type" to "text/javascript; charset=utf-8",
        "Content-Length" to payload.size.toString(),
        "Access-Control-Allow-Origin" to "*",
        "Connection" to if (keepAlive) "keep-alive" else "close",
      )
      writeHeaders(output, 200, "OK", headers)
      if (method != "HEAD") output.write(payload)
      return keepAlive
    }

    val file = resolve(rawTarget)
    if (file == null) {
      writeStatus(output, 404, "Not Found")
      return keepAlive
    }
    // Live/staging bytes are not yet an activated, whole-build-verified copy.
    // Do not let Chromium keep them under the final immutable build URL.
    val cacheControl = if (file.absolutePath.startsWith(liveCacheRoot.absolutePath + File.separator) ||
      file.absolutePath.contains("${File.separator}.staging-")) "no-store"
      else "public, max-age=31536000, immutable"

    val length = file.length()
    var start = 0L
    var end = length - 1
    var partial = false
    if (rangeHeader != null && rangeHeader.startsWith("bytes=")) {
      val spec = rangeHeader.removePrefix("bytes=").split("-")
      val from = spec.getOrNull(0)?.trim()?.toLongOrNull()
      val to = spec.getOrNull(1)?.trim()?.toLongOrNull()
      when {
        from != null -> {
          start = from
          if (to != null) end = minOf(to, length - 1)
          partial = true
        }
        to != null -> {
          // Suffix range: the last `to` bytes.
          start = maxOf(0L, length - to)
          partial = true
        }
      }
      if (start > end || start >= length) {
        writeHeaders(
          output,
          416,
          "Range Not Satisfiable",
          mapOf("Content-Range" to "bytes */$length", "Content-Length" to "0"),
        )
        return keepAlive
      }
    }

    if (file.name.endsWith(".html", ignoreCase = true) && !partial) {
      val raw = file.readText(Charsets.UTF_8)
      val processed = if (raw.contains("fonts.googleapis.com")) {
        raw.replace(Regex("""(<link\b[^>]*\bhref=["'][^"']*fonts\.googleapis\.com[^"']*["'][^>]*>)""", RegexOption.IGNORE_CASE)) { m ->
          val tag = m.value
          if (!tag.contains("media=")) {
            tag.replace(Regex("""\brel=["']stylesheet["']""", RegexOption.IGNORE_CASE), """media="print" onload="this.media='all'" rel="stylesheet"""")
          } else {
            tag
          }
        }
      } else {
        raw
      }
      val payload = processed.toByteArray(Charsets.UTF_8)
      val htmlHeaders = linkedMapOf(
        "Content-Type" to "text/html; charset=utf-8",
        "Content-Length" to payload.size.toString(),
        "Accept-Ranges" to "bytes",
        "Cache-Control" to cacheControl,
        "Access-Control-Allow-Origin" to "*",
        "Cross-Origin-Resource-Policy" to "cross-origin",
        "X-Content-Type-Options" to "nosniff",
        "Connection" to if (keepAlive) "keep-alive" else "close",
      )
      writeHeaders(output, 200, "OK", htmlHeaders)
      if (method != "HEAD") output.write(payload)
      return keepAlive
    }

    val contentLength = end - start + 1
    val headers = linkedMapOf(
      "Content-Type" to mimeTypeOf(file.name),
      "Content-Length" to contentLength.toString(),
      "Accept-Ranges" to "bytes",
      // Immutable caching applies only after whole-build verification.
      "Cache-Control" to cacheControl,
      "Access-Control-Allow-Origin" to "*",
      "Cross-Origin-Resource-Policy" to "cross-origin",
      "X-Content-Type-Options" to "nosniff",
      "Connection" to if (keepAlive) "keep-alive" else "close",
    )
    if (partial) headers["Content-Range"] = "bytes $start-$end/$length"

    writeHeaders(output, if (partial) 206 else 200, if (partial) "Partial Content" else "OK", headers)
    if (method == "HEAD") return keepAlive

    file.inputStream().use { stream ->
      // skip() is allowed to move fewer bytes than asked for, and a short skip
      // on a range request would serve the wrong bytes rather than fail loudly.
      var toSkip = start
      while (toSkip > 0) {
        val skipped = stream.skip(toSkip)
        if (skipped <= 0) break
        toSkip -= skipped
      }
      val buffer = ByteArray(64 * 1024)
      var remaining = contentLength
      while (remaining > 0) {
        val read = stream.read(buffer, 0, minOf(buffer.size.toLong(), remaining).toInt())
        if (read <= 0) break
        output.write(buffer, 0, read)
        remaining -= read
      }
    }
    return keepAlive
  }

  /**
   * Maps `/token/<gameId>/<buildId>/<path>` onto the store, refusing anything
   * that does not resolve strictly inside the named build directory.
   */
  private fun resolve(rawTarget: String): File? {
    val pathOnly = rawTarget.substringBefore('?').substringBefore('#')
    val decoded = try {
      URLDecoder.decode(pathOnly, "UTF-8")
    } catch (_: Exception) {
      return null
    }
    val segments = decoded.split("/").filter { it.isNotEmpty() }
    if (segments.size < 4) return null
    if (segments[0] != token) return null
    val gameId = segments[1]
    val buildId = segments[2]
    if (!gameId.matches(SAFE_ID) || !buildId.matches(SAFE_ID)) return null
    val relative = segments.subList(3, segments.size).joinToString("/")
    if (!GameBundleStore.isSafeRelativePath(relative)) return null

    val buildDir = if (gameId == "__tutorial") File(tutorialRoot, buildId)
      else store.buildDir(gameId, buildId)
    val file = File(buildDir, relative)
    val canonicalRoot = try {
      buildDir.canonicalPath + File.separator
    } catch (_: IOException) {
      return null
    }
    val canonicalFile = try {
      file.canonicalPath
    } catch (_: IOException) {
      return null
    }
    if (!canonicalFile.startsWith(canonicalRoot)) return null
    if (gameId == "__tutorial") return file.takeIf { it.isFile && it.canRead() }
    if (store.isActive(gameId, buildId) && file.isFile && file.canRead()) return file
    // The downloader publishes each staging file only after its manifest hash
    // matches. Reuse those bytes before asking the network for a live file.
    val staged = File(store.stagingDir(gameId, buildId), relative)
    if (staged.isFile && staged.canRead()) return staged
    return fetchLiveFile(gameId, buildId, relative)
  }

  /** Fetches an individual missing asset through the canonical download API. */
  private fun fetchLiveFile(gameId: String, buildId: String, relative: String): File? {
    val version = liveVersions["$gameId|$buildId"] ?: return null
    val cache = File(liveCacheRoot, "$gameId/$buildId/$relative")
    if (cache.isFile) return cache
    val key = "$gameId|$buildId|$relative"
    val lock = liveFileLocks.getOrPut(key) { Any() }
    synchronized(lock) {
      if (cache.isFile) return cache
      val active = File(store.buildDir(gameId, buildId), relative)
      if (store.isActive(gameId, buildId) && active.isFile && active.canRead()) return active
      val staged = File(store.stagingDir(gameId, buildId), relative)
      if (staged.isFile && staged.canRead()) return staged
      if (liveCacheRoot.usableSpace < MIN_FREE_BYTES) return null
      val encoded = relative.split("/").joinToString("/") {
        URLEncoder.encode(it, "UTF-8").replace("+", "%20")
      }
      val url = "https://$DOWNLOAD_HOST/api/offline-bundles/$gameId/$version/$encoded?b=$buildId"
      val part = File(cache.parentFile, "${cache.name}.part")
      cache.parentFile?.mkdirs()
      var connection: HttpURLConnection? = null
      try {
        connection = openTrusted(url)
        if (connection.responseCode != 200) return null
        val expectedBytes = connection.contentLengthLong
        if (expectedBytes > MAX_LIVE_FILE_BYTES) return null
        var written = 0L
        connection.inputStream.use { input ->
          part.outputStream().use { output ->
            val buffer = ByteArray(64 * 1024)
            while (true) {
              val read = input.read(buffer)
              if (read < 0) break
              written += read
              if (written > MAX_LIVE_FILE_BYTES) throw IOException("Live game asset too large")
              output.write(buffer, 0, read)
            }
          }
        }
        if (expectedBytes >= 0 && written != expectedBytes) return null
        if (!part.renameTo(cache)) {
          val completed = File(store.buildDir(gameId, buildId), relative)
          return completed.takeIf { store.isActive(gameId, buildId) && it.isFile && it.canRead() }
        }
        return cache
      } catch (_: Exception) {
        val completed = File(store.buildDir(gameId, buildId), relative)
        return completed.takeIf { store.isActive(gameId, buildId) && it.isFile && it.canRead() }
      } finally {
        connection?.disconnect()
        if (part.exists()) part.delete()
        liveFileLocks.remove(key, lock)
      }
    }
  }

  /** Never follow a redirect to an IP, preview host, or insecure origin. */
  private fun openTrusted(initial: String): HttpURLConnection {
    var current = URL(initial)
    repeat(6) { redirects ->
      if (current.protocol != "https" || current.host != DOWNLOAD_HOST ||
        current.port !in listOf(-1, 443)) throw IOException("Untrusted game URL")
      val connection = (current.openConnection() as HttpURLConnection).apply {
        instanceFollowRedirects = false
        connectTimeout = 12_000
        readTimeout = 30_000
        useCaches = false
        setRequestProperty("Accept-Encoding", "identity")
      }
      val status = connection.responseCode
      if (status !in listOf(301, 302, 303, 307, 308)) return connection
      val location = connection.getHeaderField("Location")
      connection.disconnect()
      if (location.isNullOrEmpty() || redirects == 5) throw IOException("Invalid game redirect")
      current = URL(current, location)
    }
    throw IOException("Too many game redirects")
  }

  private fun readLine(input: InputStream): String? {
    val builder = StringBuilder(128)
    while (true) {
      val byte = input.read()
      if (byte < 0) return if (builder.isEmpty()) null else builder.toString()
      if (byte == '\n'.code) return builder.toString().trimEnd('\r')
      if (builder.length > 8192) return null
      builder.append(byte.toChar())
    }
  }

  private fun writeStatus(output: OutputStream, code: Int, reason: String) {
    writeHeaders(
      output,
      code,
      reason,
      mapOf("Content-Length" to "0", "Connection" to "close"),
    )
  }

  private fun writeHeaders(
    output: OutputStream,
    code: Int,
    reason: String,
    headers: Map<String, String>,
  ) {
    val builder = StringBuilder(256)
    builder.append("HTTP/1.1 ").append(code).append(' ').append(reason).append("\r\n")
    for ((name, value) in headers) builder.append(name).append(": ").append(value).append("\r\n")
    builder.append("\r\n")
    output.write(builder.toString().toByteArray(Charsets.ISO_8859_1))
  }

  companion object {
    /** Arbitrary but fixed: the first choice for a stable, sticky origin. */
    private const val DEFAULT_PORT = 42731
    private val SAFE_ID = Regex("^[A-Za-z0-9._-]{1,128}$")
    private val SAFE_VERSION = Regex("^\\d+\\.\\d+\\.\\d+$")
    private const val DOWNLOAD_HOST = "games.raiabdullah.tech"
    private const val MIN_FREE_BYTES = 128L * 1024 * 1024
    private const val MAX_LIVE_FILE_BYTES = 256L * 1024 * 1024

    fun mimeTypeOf(name: String): String {
      val lower = name.lowercase()
      val dot = lower.lastIndexOf('.')
      return when (if (dot >= 0) lower.substring(dot + 1) else "") {
        "html", "htm" -> "text/html; charset=utf-8"
        "js", "mjs" -> "text/javascript; charset=utf-8"
        "css" -> "text/css; charset=utf-8"
        "json" -> "application/json; charset=utf-8"
        "wasm" -> "application/wasm"
        "map" -> "application/json; charset=utf-8"
        "svg" -> "image/svg+xml"
        "png" -> "image/png"
        "jpg", "jpeg" -> "image/jpeg"
        "gif" -> "image/gif"
        "webp" -> "image/webp"
        "avif" -> "image/avif"
        "ico" -> "image/x-icon"
        "bmp" -> "image/bmp"
        "mp3" -> "audio/mpeg"
        "ogg", "oga" -> "audio/ogg"
        "wav" -> "audio/wav"
        "m4a" -> "audio/mp4"
        "aac" -> "audio/aac"
        "webm" -> "video/webm"
        "mp4" -> "video/mp4"
        "woff" -> "font/woff"
        "woff2" -> "font/woff2"
        "ttf" -> "font/ttf"
        "otf" -> "font/otf"
        "eot" -> "application/vnd.ms-fontobject"
        "txt" -> "text/plain; charset=utf-8"
        "xml" -> "application/xml; charset=utf-8"
        "atlas" -> "text/plain; charset=utf-8"
        "fnt" -> "text/plain; charset=utf-8"
        "glb" -> "model/gltf-binary"
        "gltf" -> "model/gltf+json"
        else -> "application/octet-stream"
      }
    }
  }
}
