package com.swipeplay.app.bundles

import java.io.File
import java.io.FilterInputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream

/** HTTP body forwarding; partial copies must never be published as cached files. */
internal object LiveAssetTransfer {
  private val fontLink = Regex(
    """(<link\b[^>]*\bhref=["'][^"']*fonts\.googleapis\.com[^"']*["'][^>]*>)""", RegexOption.IGNORE_CASE,
  )
  private val stylesheetRel = Regex("""\brel=["']stylesheet["']""", RegexOption.IGNORE_CASE)

  fun forward(
    input: InputStream,
    output: OutputStream,
    expectedBytes: Long,
    chunked: Boolean,
    html: Boolean,
    part: File?,
    maxCacheBytes: Long,
  ): Boolean {
    // Cache writes are optional: disk pressure must not prevent online play.
    var cache = try { part?.outputStream() } catch (_: IOException) { null }
    var received = 0L
    var complete = false
    fun discardCache() {
      try { cache?.close() } catch (_: IOException) {}
      cache = null
      part?.delete()
    }
    val incoming = object : FilterInputStream(input) {
      override fun read(bytes: ByteArray, offset: Int, length: Int): Int {
        val count = super.read(bytes, offset, length)
        if (count > 0) {
          received += count
          if (expectedBytes >= 0 && received > expectedBytes) throw IOException("Oversized live asset")
          if (cache != null && received > maxCacheBytes) discardCache()
          try { cache?.write(bytes, offset, count) } catch (_: IOException) { discardCache() }
        }
        return count
      }
    }
    fun emit(bytes: ByteArray, count: Int = bytes.size) {
      if (count == 0) return
      if (chunked) output.write("${count.toString(16)}\r\n".toByteArray(Charsets.US_ASCII))
      output.write(bytes, 0, count)
      if (chunked) output.write("\r\n".toByteArray(Charsets.US_ASCII))
      output.flush()
    }
    try {
      if (html) {
        // Decode UTF-8 across network packet boundaries. Keep only an unfinished
        // tag so the existing non-blocking Google-font rewrite also works when
        // a link tag spans two reads. Large inline engines still stream.
        val reader = incoming.reader(Charsets.UTF_8)
        val chars = CharArray(8192)
        var pending = ""
        while (true) {
          val count = reader.read(chars)
          if (count < 0) break
          val text = pending + String(chars, 0, count)
          val open = text.lastIndexOf('<')
          val split = if (open > text.lastIndexOf('>') && text.length - open <= 8192) open else text.length
          emit(rewriteHtml(text.substring(0, split)).toByteArray(Charsets.UTF_8))
          pending = text.substring(split)
        }
        emit(rewriteHtml(pending).toByteArray(Charsets.UTF_8))
      } else {
        val buffer = ByteArray(64 * 1024)
        while (true) {
          val count = incoming.read(buffer)
          if (count < 0) break
          emit(buffer, count)
        }
      }
      if (expectedBytes >= 0 && received != expectedBytes) throw IOException("Short live asset")
      try { cache?.close() } catch (_: IOException) { discardCache() }
      if (chunked) output.write("0\r\n\r\n".toByteArray(Charsets.US_ASCII))
      output.flush()
      complete = true
      return cache != null
    } finally {
      if (!complete) discardCache()
    }
  }

  fun rewriteHtml(raw: String): String = raw.replace(fontLink) { match ->
    val tag = match.value
    if (!tag.contains("media=", ignoreCase = true)) {
      tag.replace(stylesheetRel,
        """media="print" onload="this.media='all'" rel="stylesheet"""")
    } else tag
  }
}
