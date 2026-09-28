package com.swipeplay.app.bundles

import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.io.IOException
import java.io.InterruptedIOException
import java.security.MessageDigest
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

class VerifiedBundleArchiveTest {
  @get:Rule val temporary = TemporaryFolder()
  private fun descriptor(path: String, contents: String) = BundleFile(path,
    contents.toByteArray().size.toLong(), MessageDigest.getInstance("SHA-256")
      .digest(contents.toByteArray()).joinToString("") { "%02x".format(it) })
  private fun archive(vararg files: Pair<String, String>): File {
    val file = temporary.newFile()
    ZipOutputStream(file.outputStream()).use { zip ->
      for ((path, contents) in files) {
        zip.putNextEntry(ZipEntry(path))
        zip.write(contents.toByteArray())
        zip.closeEntry()
      }
    }
    return file
  }

  @Test fun extractsAndChecksEveryFileWithBoundedBuffers() {
    val stage = temporary.newFolder()
    val zip = archive("index.html" to "game", "assets/é.js" to "engine")
    var bytes = 0L
    VerifiedBundleArchive.extract(zip, stage, listOf(descriptor("index.html", "game"), descriptor("assets/é.js", "engine")), onBytes = { bytes = it })
    assertEquals("game", File(stage, "index.html").readText())
    assertEquals("engine", File(stage, "assets/é.js").readText())
    assertEquals(10L, bytes)
  }

  @Test fun rejectsZipTraversalAndLeavesNothingOutsideStaging() {
    val stage = temporary.newFolder()
    assertThrows(IOException::class.java) {
      VerifiedBundleArchive.extract(archive("../escape" to "bad"), stage, listOf(descriptor("../escape", "bad")))
    }
    assertFalse(File(stage.parentFile, "escape").exists())
  }

  @Test fun rejectsUnknownAndMissingFiles() {
    val stage = temporary.newFolder()
    assertThrows(IOException::class.java) {
      VerifiedBundleArchive.extract(archive("extra.js" to "extra"), stage, listOf(descriptor("index.html", "game")))
    }
    assertThrows(IOException::class.java) {
      VerifiedBundleArchive.extract(archive("index.html" to "game"), stage,
        listOf(descriptor("index.html", "game"), descriptor("missing.js", "missing")))
    }
  }

  @Test fun rejectsMismatchedHashesAndZipBombSizesWithoutPublishingTheFile() {
    for (expected in listOf(descriptor("index.html", "same"), descriptor("index.html", "x"))) {
      val stage = temporary.newFolder()
      assertThrows(IOException::class.java) {
        VerifiedBundleArchive.extract(archive("index.html" to "game"), stage, listOf(expected))
      }
      assertFalse(File(stage, "index.html").exists())
      assertFalse(File(stage, ".index.html.zip-part").exists())
    }
  }

  @Test fun interruptionKeepsPreviouslyVerifiedStartupFilesAndNeverPublishesPartialFiles() {
    val stage = temporary.newFolder()
    File(stage, "index.html").writeText("game")
    var calls = 0
    assertThrows(InterruptedIOException::class.java) {
      VerifiedBundleArchive.extract(archive("index.html" to "game", "large.js" to "x".repeat(100_000)), stage,
        listOf(descriptor("index.html", "game"), descriptor("large.js", "x".repeat(100_000))),
        beforeChunk = { if (++calls > 7) throw InterruptedIOException("Foreground asset needs priority") })
    }
    assertEquals("game", File(stage, "index.html").readText())
    assertFalse(File(stage, "large.js").exists())
    assertFalse(File(stage, ".large.js.zip-part").exists())
  }

  @Test fun aSameSizedCorruptStagingFileCannotBeReused() {
    val stage = temporary.newFolder()
    File(stage, "index.html").writeText("oops")
    VerifiedBundleArchive.extract(archive("index.html" to "game"), stage, listOf(descriptor("index.html", "game")))
    assertEquals("game", File(stage, "index.html").readText())
  }

  @Test fun rejectsDuplicateManifestPaths() {
    val stage = temporary.newFolder()
    val file = descriptor("index.html", "game")
    assertThrows(IOException::class.java) {
      VerifiedBundleArchive.extract(archive("index.html" to "game"), stage, listOf(file, file))
    }
  }
}
