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
  })  : baseUrl =
            (baseUrl ?? AppConstants.defaultBaseUrl).replaceAll(RegExp(r'/+$'), ''),
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
        final catalog = _prepareCatalog(CatalogModel.fromJson(decoded));

        // Cache only a catalog that passed origin, checksum and size checks.
        await prefs.setString(
          AppConstants.keyCachedCatalog,
          jsonEncode(catalog.toJson()),
        );
        return catalog;
      }
    } catch (_) {
      // Network/catalog validation failed; continue to trusted local fallbacks.
    }

    final cachedJson = prefs.getString(AppConstants.keyCachedCatalog);
    if (cachedJson != null) {
      try {
        final decoded = jsonDecode(cachedJson) as Map<String, dynamic>;
        return _prepareCatalog(CatalogModel.fromJson(decoded));
      } catch (_) {
        await prefs.remove(AppConstants.keyCachedCatalog);
      }
    }

    final assetString =
        await rootBundle.loadString('assets/catalog/games.json');
    final assetJson = jsonDecode(assetString) as Map<String, dynamic>;
    return _prepareCatalog(CatalogModel.fromJson(assetJson));
  }

  CatalogModel _prepareCatalog(CatalogModel catalog) {
    final normalized = CatalogModel(
      version: catalog.version,
      updatedAt: catalog.updatedAt,
      games: catalog.games.map(_normalizeGame).toList(),
    );
    _validateCatalog(normalized);
    return normalized;
  }

  GameItem _normalizeGame(GameItem game) {
    String replacePlaceholderOrigin(String url) {
      try {
        final uri = Uri.parse(url);
        if (uri.host == 'localhost' ||
            uri.host == '127.0.0.1' ||
            uri.host == '10.0.2.2' ||
            uri.host == 'games.example.com') {
          final baseUri = Uri.parse(baseUrl);
          return uri
              .replace(
                scheme: baseUri.scheme,
                host: baseUri.host,
                port: baseUri.hasPort ? baseUri.port : null,
              )
              .toString();
        }
      } catch (_) {}
      return url;
    }

    return GameItem(
      id: game.id,
      title: game.title,
      version: game.version,
      entryUrl: replacePlaceholderOrigin(game.entryUrl),
      thumbnailUrl: replacePlaceholderOrigin(game.thumbnailUrl),
      manifestUrl: replacePlaceholderOrigin(game.manifestUrl),
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

  void _validateCatalog(CatalogModel catalog) {
    final trustedBase = Uri.parse(baseUrl);
    if (!trustedBase.hasScheme || trustedBase.host.isEmpty) {
      throw StateError('GAMES_BASE_URL is invalid: $baseUrl');
    }

    final ids = <String>{};
    for (final game in catalog.games) {
      if (!ids.add(game.id)) {
        throw StateError('Duplicate game id in catalog: ${game.id}');
      }
      if (game.sizeBytes <= 0 ||
          game.sizeBytes > AppConstants.maxGamePackageBytes) {
        throw StateError('${game.id} exceeds the game package size limit.');
      }
      if (game.sha256 == null ||
          !RegExp(r'^[a-fA-F0-9]{64}$').hasMatch(game.sha256!)) {
        throw StateError('${game.id} has an invalid SHA-256 checksum.');
      }

      for (final rawUrl in <String>[
        game.entryUrl,
        game.manifestUrl,
        game.thumbnailUrl,
      ]) {
        final uri = Uri.tryParse(rawUrl);
        if (uri == null || !_isSameOrigin(uri, trustedBase)) {
          throw StateError('${game.id} uses an untrusted catalog URL: $rawUrl');
        }
      }
    }
  }

  bool _isSameOrigin(Uri a, Uri b) {
    int effectivePort(Uri uri) {
      if (uri.hasPort) return uri.port;
      return uri.scheme == 'https' ? 443 : 80;
    }

    return a.scheme == b.scheme &&
        a.host == b.host &&
        effectivePort(a) == effectivePort(b);
  }

  void dispose() {
    client.close();
  }
}
