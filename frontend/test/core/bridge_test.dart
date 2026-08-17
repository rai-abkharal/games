import 'package:flutter_test/flutter_test.dart';
import 'package:frontend/core/bridge/game_bridge.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('GameBridgeController Tests', () {
    late GameBridgeController controller;

    setUp(() {
      controller = GameBridgeController();
    });

    test('Parses and notifies bridge listeners for ready event', () {
      String? receivedAction;
      Map<String, dynamic>? receivedPayload;

      controller.addListener((action, payload) {
        receivedAction = action;
        receivedPayload = payload;
      });

      controller.handleIncomingMessage('{"action":"ready","payload":{}}');

      expect(receivedAction, 'ready');
      expect(receivedPayload, isEmpty);
    });

    test('Parses and notifies bridge listeners for gameOver payload', () {
      String? receivedAction;
      Map<String, dynamic>? receivedPayload;

      controller.addListener((action, payload) {
        receivedAction = action;
        receivedPayload = payload;
      });

      controller.handleIncomingMessage(
        '{"action":"gameOver","payload":{"score":1450,"timeSpentSeconds":30}}',
      );

      expect(receivedAction, 'gameOver');
      expect(receivedPayload?['score'], 1450);
      expect(receivedPayload?['timeSpentSeconds'], 30);
    });
  });
}
