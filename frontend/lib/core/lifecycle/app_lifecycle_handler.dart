import 'package:flutter/widgets.dart';
import '../bridge/game_bridge.dart';

class AppLifecycleHandler with WidgetsBindingObserver {
  final GameBridgeController bridgeController;

  AppLifecycleHandler(this.bridgeController);

  void start() {
    WidgetsBinding.instance.addObserver(this);
  }

  void stop() {
    WidgetsBinding.instance.removeObserver(this);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused || state == AppLifecycleState.inactive) {
      bridgeController.sendPause();
    } else if (state == AppLifecycleState.resumed) {
      bridgeController.sendResume();
    }
  }
}
