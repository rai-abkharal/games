import 'dart:convert';
import 'package:flutter/services.dart' show rootBundle;
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../../models/game_manifest.dart';
import '../constants/app_constants.dart';

class ApiClient {
  final String baseUrl;
  final http.Client client;

  ApiClient({
    String? baseUrl,
    http.Client? client,
  })  : baseUrl = (baseUrl ?? AppConstants.defaultBaseUrl).replaceAll(RegExp(r'/+$'), ''),
        client = client ?? http.Client();

  Future<CatalogModel> fetchCatalog() async {
    final prefs = await SharedPreferences.getInstance();
    
    try {
      final uri = Uri.parse('$baseUrl/api/games');
      final response = await client
          .get(uri)
          .timeout(AppConstants.requestTimeout);

      if (response.statusCode == 200) {
        final decoded = jsonDecode(response.body) as Map<String, dynamic>;
        final catalog = CatalogModel.fromJson(decoded);

        // Cache catalog locally for offline access
        await prefs.setString(AppConstants.keyCachedCatalog, response.body);
        return _normalizeCatalog(catalog);
      }
    } catch (e) {
      // Network unreachable, proceed to fallback
    }

    // 1. Try previously cached catalog in SharedPreferences
    final cachedJson = prefs.getString(AppConstants.keyCachedCatalog);
    if (cachedJson != null) {
      try {
        final decoded = jsonDecode(cachedJson) as Map<String, dynamic>;
        return _normalizeCatalog(CatalogModel.fromJson(decoded));
      } catch (_) {}
    }

    // 2. Fallback to bundled asset catalog
    final assetString = await rootBundle.loadString('assets/catalog/games.json');
    final assetJson = jsonDecode(assetString) as Map<String, dynamic>;
    return _normalizeCatalog(CatalogModel.fromJson(assetJson));
  }

  CatalogModel _normalizeCatalog(CatalogModel catalog) {
    return CatalogModel(
      version: catalog.version,
      updatedAt: catalog.updatedAt,
      games: catalog.games.map(_normalizeGame).toList(),
    );
  }

  GameItem _normalizeGame(GameItem game) {
    String replaceHost(String url) {
      try {
        final uri = Uri.parse(url);
        if (uri.host == 'localhost' || uri.host == '127.0.0.1' || uri.host == '10.0.2.2' || uri.host == 'games.example.com') {
          final baseUri = Uri.parse(baseUrl);
          return uri.replace(
            scheme: baseUri.scheme,
            host: baseUri.host,
            port: baseUri.hasPort ? baseUri.port : null,
          ).toString();
        }
      } catch (_) {}
      return url;
    }

    return GameItem(
      id: game.id,
      title: game.title,
      version: game.version,
      entryUrl: replaceHost(game.entryUrl),
      thumbnailUrl: replaceHost(game.thumbnailUrl),
      manifestUrl: replaceHost(game.manifestUrl),
      sizeBytes: game.sizeBytes,
      orientation: game.orientation,
      engine: game.engine,
      feedOrder: game.feedOrder,
      category: game.category,
      description: game.description,
      sha256: game.sha256,
      features: game.features,
    );
  }
}
