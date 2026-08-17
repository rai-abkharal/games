class GameFeatures {
  final bool sound;
  final bool vibration;

  const GameFeatures({
    this.sound = true,
    this.vibration = false,
  });

  factory GameFeatures.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const GameFeatures();
    return GameFeatures(
      sound: json['sound'] as bool? ?? true,
      vibration: json['vibration'] as bool? ?? false,
    );
  }

  Map<String, dynamic> toJson() => {
        'sound': sound,
        'vibration': vibration,
      };
}

class GameItem {
  final String id;
  final String title;
  final String version;
  final String entryUrl;
  final String thumbnailUrl;
  final int sizeBytes;
  final String orientation;
  final String engine;
  final String manifestUrl;
  final int feedOrder;
  final String category;
  final String description;
  final String? sha256;
  final GameFeatures features;

  const GameItem({
    required this.id,
    required this.title,
    required this.version,
    required this.entryUrl,
    required this.thumbnailUrl,
    required this.sizeBytes,
    this.orientation = 'portrait',
    this.engine = 'phaser',
    required this.manifestUrl,
    required this.feedOrder,
    this.category = 'Arcade',
    this.description = '',
    this.sha256,
    this.features = const GameFeatures(),
  });

  factory GameItem.fromJson(Map<String, dynamic> json) {
    return GameItem(
      id: json['id'] as String,
      title: json['title'] as String,
      version: json['version'] as String,
      entryUrl: json['entryUrl'] as String,
      thumbnailUrl: json['thumbnailUrl'] as String,
      sizeBytes: (json['sizeBytes'] as num).toInt(),
      orientation: json['orientation'] as String? ?? 'portrait',
      engine: json['engine'] as String? ?? 'phaser',
      manifestUrl: json['manifestUrl'] as String,
      feedOrder: (json['feedOrder'] as num?)?.toInt() ?? 99,
      category: json['category'] as String? ?? 'Arcade',
      description: json['description'] as String? ?? '',
      sha256: json['sha256'] as String?,
      features: GameFeatures.fromJson(json['features'] as Map<String, dynamic>?),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'version': version,
        'entryUrl': entryUrl,
        'thumbnailUrl': thumbnailUrl,
        'sizeBytes': sizeBytes,
        'orientation': orientation,
        'engine': engine,
        'manifestUrl': manifestUrl,
        'feedOrder': feedOrder,
        'category': category,
        'description': description,
        if (sha256 != null) 'sha256': sha256,
        'features': features.toJson(),
      };
}

class CatalogModel {
  final int version;
  final String? updatedAt;
  final List<GameItem> games;

  const CatalogModel({
    required this.version,
    this.updatedAt,
    required this.games,
  });

  factory CatalogModel.fromJson(Map<String, dynamic> json) {
    final list = (json['games'] as List<dynamic>)
        .map((e) => GameItem.fromJson(e as Map<String, dynamic>))
        .toList();
    list.sort((a, b) => a.feedOrder.compareTo(b.feedOrder));

    return CatalogModel(
      version: (json['version'] as num).toInt(),
      updatedAt: json['updatedAt'] as String?,
      games: list,
    );
  }

  Map<String, dynamic> toJson() => {
        'version': version,
        if (updatedAt != null) 'updatedAt': updatedAt,
        'games': games.map((e) => e.toJson()).toList(),
      };
}
