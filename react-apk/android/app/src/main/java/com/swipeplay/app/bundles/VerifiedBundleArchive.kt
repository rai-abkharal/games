package com.swipeplay.app.bundles

import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.security.MessageDigest
import java.util.zip.ZipInputStream

data class BundleFile(val path: String, val bytes: Long, val sha256: String)

/** ZIP is a transport optimization, never a substitute for per-file verification. */
object VerifiedBundleArchive {
  fun extract(archive: File, staging: File, files: List<BundleFile>,
    beforeChunk: () -> Unit = {}, onBytes: (Long) -> Unit = {}) {
    val expected = files.associateBy { it.path }
    if (expected.size != files.size) throw IOException("Duplicate manifest paths")
    val seen = HashSet<String>()
    val root = staging.canonicalPath + File.separator
    staging.mkdirs()
    var done = 0L
    ZipInputStream(archive.inputStream().buffered(32 * 1024)).use { zip ->
      while (true) {
        beforeChunk()
        val entry = zip.nextEntry ?: break
        val path = entry.name
        if (entry.isDirectory || path.contains('\\') || path.startsWith('/') ||
          path.split('/').any { it.isEmpty() || it == "." || it == ".." }) {
          throw IOException("Unsafe ZIP entry")
        }
        val descriptor = expected[path] ?: throw IOException("Unexpected ZIP entry: $path")
        if (!seen.add(path)) throw IOException("Duplicate ZIP entry: $path")
        val target = File(staging, path)
        if (!target.canonicalPath.startsWith(root)) throw IOException("ZIP path escapes build")
        target.parentFile?.mkdirs()
        val part = File(target.parentFile, ".${target.name}.zip-part")
        try {
          // Verified startup files already on disk need no duplicate write/fsync.
          // Still read and verify their archive entries to validate the whole ZIP.
          val existingMatches = target.isFile && target.length() == descriptor.bytes &&
            sha256(target, beforeChunk) == descriptor.sha256.lowercase()
          val digest = MessageDigest.getInstance("SHA-256")
          var written = 0L
          (if (existingMatches) null else FileOutputStream(part)).use { output ->
            val buffer = ByteArray(32 * 1024)
            while (true) {
              beforeChunk()
              val read = zip.read(buffer)
              if (read < 0) break
              written += read
              if (written > descriptor.bytes) throw IOException("ZIP entry exceeds manifest size")
              digest.update(buffer, 0, read)
              output?.write(buffer, 0, read)
              done += read
              onBytes(done)
            }
            if (written != descriptor.bytes ||
              digest.digest().joinToString("") { "%02x".format(it) } != descriptor.sha256.lowercase()) {
              throw IOException("ZIP file hash/size mismatch: $path")
            }
            output?.fd?.sync()
          }
          // Startup files may already be serving a running game. Their verified
          // content is identical: don't replace its directory entry unnecessarily.
          if (!existingMatches && !part.renameTo(target)) {
            if (target.exists() && !target.delete()) throw IOException("Cannot replace ZIP file: $path")
            if (!part.renameTo(target)) throw IOException("Cannot publish ZIP file: $path")
          }
        } finally {
          part.delete()
        }
        zip.closeEntry()
      }
    }
    if (seen != expected.keys) throw IOException("ZIP is missing manifest files")
  }

  private fun sha256(file: File, beforeChunk: () -> Unit): String {
    val hash = MessageDigest.getInstance("SHA-256")
    file.inputStream().use { input ->
      val buffer = ByteArray(32 * 1024)
      while (true) {
        beforeChunk()
        val read = input.read(buffer)
        if (read < 0) break
        hash.update(buffer, 0, read)
      }
    }
    return hash.digest().joinToString("") { "%02x".format(it) }
  }
}
