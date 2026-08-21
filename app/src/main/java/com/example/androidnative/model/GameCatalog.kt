package com.example.androidnative.model

import com.google.gson.annotations.SerializedName

data class GameCatalog(
    @SerializedName("version") val version: Int = 1,
    @SerializedName("updatedAt") val updatedAt: String = "",
    @SerializedName("games") val games: List<GameItem> = emptyList()
)

data class TouchZone(
    @SerializedName("name") val name: String = "gameplay",
    @SerializedName("x") val x: Float = 0f,
    @SerializedName("y") val y: Float = 0f,
    @SerializedName("width") val width: Float = 1f,
    @SerializedName("height") val height: Float = 1f
)

data class GameItem(
    @SerializedName("id") val id: String,
    @SerializedName("title") val title: String,
    @SerializedName("version") val version: String,
    @SerializedName("entryUrl") val entryUrl: String,
    @SerializedName("thumbnailUrl") val thumbnailUrl: String = "",
    @SerializedName("sizeBytes") val sizeBytes: Long = 0L,
    @SerializedName("orientation") val orientation: String = "portrait",
    @SerializedName("engine") val engine: String = "phaser",
    @SerializedName("manifestUrl") val manifestUrl: String = "",
    @SerializedName("feedOrder") val feedOrder: Int = 0,
    @SerializedName("category") val category: String = "Arcade",
    @SerializedName("description") val description: String = "",
    @SerializedName("sha256") val sha256: String? = null,
    @SerializedName("touchZones") val touchZones: List<TouchZone> = emptyList(),
    @SerializedName("features") val features: Map<String, Boolean>? = null,
    @SerializedName("createdAt") val createdAt: String? = null,
    @SerializedName("updatedAt") val updatedAt: String? = null
)
