package com.swipeplay.app.bundles

import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream

class LiveAssetTransferTest {
  @get:Rule val temporary = TemporaryFolder()

  @Test fun forwardsFirstPacketBeforeReadingTheRestAndOnlyCachesCompleteBytes() {
    val output = ByteArrayOutputStream()
    val part = temporary.root.resolve("engine.js.part")
    var secondRead = false
    val input = packets(listOf("first".toByteArray(), "second".toByteArray())) { index ->
      if (index == 1) {
        secondRead = true
        assertEquals("first", output.toString("UTF-8"))
        assertTrue(part.isFile)
        assertFalse(temporary.root.resolve("engine.js").exists())
      }
    }
    assertTrue(LiveAssetTransfer.forward(input, output, 11, false, false, part, 1024))
    assertTrue(secondRead)
    assertEquals("firstsecond", output.toString("UTF-8"))
    assertEquals("firstsecond", part.readText())
  }

  @Test fun framesUnknownLengthsAsChunkedAndTerminatesOnlyAtEof() {
    val output = ByteArrayOutputStream()
    LiveAssetTransfer.forward(packets(listOf("one".toByteArray(), "two".toByteArray())),
      output, -1, true, false, null, 1024)
    assertEquals("3\r\none\r\n3\r\ntwo\r\n0\r\n\r\n", output.toString("UTF-8"))
  }

  @Test fun shortResponsesAreNotCachedOrMarkedComplete() {
    val part = temporary.root.resolve("short.part")
    val output = ByteArrayOutputStream()
    assertThrows(IOException::class.java) {
      LiveAssetTransfer.forward(ByteArrayInputStream("short".toByteArray()),
        output, 10, true, false, part, 1024)
    }
    assertFalse(part.exists())
    assertFalse(output.toString("UTF-8").endsWith("0\r\n\r\n"))
  }

  @Test fun aDroppedWebViewDeletesItsIncompleteCacheCopy() {
    val part = temporary.root.resolve("cancelled.part")
    val output = object : OutputStream() {
      override fun write(value: Int) { throw IOException("WebView closed") }
    }
    assertThrows(IOException::class.java) {
      LiveAssetTransfer.forward(ByteArrayInputStream("asset".toByteArray()),
        output, 5, false, false, part, 1024)
    }
    assertFalse(part.exists())
  }

  @Test fun aBrokenUpstreamDoesNotPublishItsPrefix() {
    val part = temporary.root.resolve("interrupted.part")
    val output = ByteArrayOutputStream()
    val input = packets(listOf("first".toByteArray(), "second".toByteArray())) { index ->
      if (index == 1) throw IOException("Internet disconnected")
    }
    assertThrows(IOException::class.java) {
      LiveAssetTransfer.forward(input, output, -1, true, false, part, 1024)
    }
    assertFalse(part.exists())
    assertEquals("5\r\nfirst\r\n", output.toString("UTF-8"))
  }

  @Test fun cacheSizeLimitsDoNotStopOnlinePlayback() {
    val part = temporary.root.resolve("too-large.part")
    val output = ByteArrayOutputStream()
    assertFalse(LiveAssetTransfer.forward(ByteArrayInputStream("large asset".toByteArray()),
      output, 11, false, false, part, 3))
    assertEquals("large asset", output.toString("UTF-8"))
    assertFalse(part.exists())
  }

  @Test fun anUnwritableCacheDoesNotStopOnlinePlayback() {
    val part = temporary.root.resolve("missing-directory/asset.part")
    val output = ByteArrayOutputStream()
    assertFalse(LiveAssetTransfer.forward(ByteArrayInputStream("asset".toByteArray()),
      output, 5, false, false, part, 1024))
    assertEquals("asset", output.toString("UTF-8"))
  }

  @Test fun streamedHtmlPreservesUtf8AndRewritesFontLinksAcrossPacketsButCachesRawBytes() {
    val raw = "<html>é<link href=\"https://fonts.googleapis.com/css2?family=Outfit\" rel=\"stylesheet\"><script>engine()</script></html>"
    val bytes = raw.toByteArray(Charsets.UTF_8)
    // One-byte packets split both the UTF-8 character and every HTML attribute.
    val input = packets(bytes.map { byteArrayOf(it) })
    val output = ByteArrayOutputStream()
    val part = temporary.root.resolve("html.part")
    assertTrue(LiveAssetTransfer.forward(input, output, bytes.size.toLong(), true, true, part, 1024))
    assertEquals(raw, part.readText())
    assertEquals(LiveAssetTransfer.rewriteHtml(raw), decodeChunks(output.toByteArray()))
    assertTrue(decodeChunks(output.toByteArray()).contains("media=\"print\""))
  }

  @Test fun aRangeBodyCanBeForwardedWithoutCachingAPartialFile() {
    val output = ByteArrayOutputStream()
    assertFalse(LiveAssetTransfer.forward(ByteArrayInputStream("range".toByteArray()),
      output, 5, false, false, null, 1024))
    assertEquals("range", output.toString("UTF-8"))
  }

  private fun packets(chunks: List<ByteArray>, before: (Int) -> Unit = {}): InputStream = object : InputStream() {
    var index = 0
    var offset = 0
    override fun read(): Int {
      val byte = ByteArray(1)
      return if (read(byte, 0, 1) < 0) -1 else byte[0].toInt() and 255
    }
    override fun read(bytes: ByteArray, start: Int, length: Int): Int {
      if (index >= chunks.size) return -1
      if (offset == 0) before(index)
      val packet = chunks[index]
      val count = minOf(length, packet.size - offset)
      packet.copyInto(bytes, start, offset, offset + count)
      offset += count
      if (offset == packet.size) { index++; offset = 0 }
      return count
    }
  }

  private fun decodeChunks(bytes: ByteArray): String {
    val input = ByteArrayInputStream(bytes)
    val output = ByteArrayOutputStream()
    while (true) {
      val header = StringBuilder()
      while (true) {
        val byte = input.read()
        check(byte >= 0)
        if (byte == 10) break
        if (byte != 13) header.append(byte.toChar())
      }
      val count = header.toString().toInt(16)
      if (count == 0) break
      val chunk = ByteArray(count)
      assertEquals(count, input.read(chunk))
      output.write(chunk)
      assertEquals(13, input.read())
      assertEquals(10, input.read())
    }
    return output.toString("UTF-8")
  }
}
