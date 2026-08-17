import 'dart:io';
import 'package:shelf/shelf.dart';
import 'package:shelf/shelf_io.dart' as shelf_io;
import 'package:shelf_static/shelf_static.dart';

class EmbeddedGameServer {
  HttpServer? _server;
  int _port = 0;
  String? _servingDirPath;

  int get port => _port;
  String get host => '127.0.0.1';
  String get baseUrl => 'http://$host:$_port';
  bool get isRunning => _server != null;

  Future<void> start(String baseDirPath, {int preferredPort = 0}) async {
    if (_server != null && _servingDirPath == baseDirPath) {
      return;
    }

    await stop();
    _servingDirPath = baseDirPath;

    final staticHandler = createStaticHandler(
      baseDirPath,
      defaultDocument: 'index.html',
      listDirectories: false,
    );

    final handler = const Pipeline()
        .addMiddleware(_corsMiddleware())
        .addHandler((Request request) async {
      try {
        return await staticHandler(request);
      } catch (e) {
        return Response.notFound('File not found');
      }
    });

    _server = await shelf_io.serve(handler, host, preferredPort);
    _port = _server!.port;
  }

  static Middleware _corsMiddleware() {
    return (Handler innerHandler) {
      return (Request request) async {
        if (request.method == 'OPTIONS') {
          return Response.ok('', headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': '*',
          });
        }
        final response = await innerHandler(request);
        return response.change(headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Cross-Origin-Resource-Policy': 'cross-origin',
        });
      };
    };
  }

  Future<void> stop() async {
    if (_server != null) {
      await _server!.close(force: true);
      _server = null;
      _port = 0;
    }
  }
}
