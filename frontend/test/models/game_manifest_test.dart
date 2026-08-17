import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:frontend/models/game_manifest.dart';

void main() {
  group('GameItem and CatalogModel Tests', () {
    const rawCatalogJson = '''
    {
      "version": 1,
      "updatedAt": "2026-08-14T12:00:00.000Z",
      "games": [
        {
          "id": "stack-tower",
          "title": "Stack Tower",
          "version": "1.0.0",
          "entryUrl": "http://localhost:8080/games/stack-tower/1.0.0/index.html",
          "thumbnailUrl": "http://localhost:8080/thumbnails/stack-tower.webp",
          "sizeBytes": 1496186,
          "orientation": "portrait",
          "engine": "phaser",
          "manifestUrl": "http://localhost:8080/games/stack-tower/1.0.0/manifest.json",
          "feedOrder": 3,
          "category": "Casual",
          "features": { "sound": true, "vibration": true }
        },
        {
          "id": "tap-cannon",
          "title": "Tap Cannon",
          "version": "1.0.0",
          "entryUrl": "http://localhost:8080/games/tap-cannon/1.0.0/index.html",
          "thumbnailUrl": "http://localhost:8080/thumbnails/tap-cannon.webp",
          "sizeBytes": 1497256,
          "orientation": "portrait",
          "engine": "phaser",
          "manifestUrl": "http://localhost:8080/games/tap-cannon/1.0.0/manifest.json",
          "feedOrder": 1,
          "category": "Arcade",
          "features": { "sound": true, "vibration": true }
        }
      ]
    }
    ''';

    test('CatalogModel parses JSON and sorts games by feedOrder', () {
      final decoded = jsonDecode(rawCatalogJson) as Map<String, dynamic>;
      final catalog = CatalogModel.fromJson(decoded);

      expect(catalog.version, 1);
      expect(catalog.games.length, 2);
      // Verify first is tap-cannon (feedOrder: 1) and second is stack-tower (feedOrder: 3)
      expect(catalog.games[0].id, 'tap-cannon');
      expect(catalog.games[0].feedOrder, 1);
      expect(catalog.games[1].id, 'stack-tower');
      expect(catalog.games[1].feedOrder, 3);
    });

    test('GameItem serialization round-trip', () {
      const item = GameItem(
        id: 'color-match',
        title: 'Color Match',
        version: '1.0.0',
        entryUrl: 'http://localhost:8080/games/color-match/1.0.0/index.html',
        thumbnailUrl: 'http://localhost:8080/thumbnails/color-match.webp',
        sizeBytes: 1495547,
        manifestUrl: 'http://localhost:8080/games/color-match/1.0.0/manifest.json',
        feedOrder: 2,
        category: 'Puzzle',
        features: GameFeatures(sound: true, vibration: false),
      );

      final json = item.toJson();
      final revived = GameItem.fromJson(json);

      expect(revived.id, item.id);
      expect(revived.title, item.title);
      expect(revived.sizeBytes, item.sizeBytes);
      expect(revived.features.sound, true);
      expect(revived.features.vibration, false);
    });
  });
}
