import 'package:flutter/material.dart';
import '../features/feed/presentation/feed_screen.dart';

class MiniGamesApp extends StatelessWidget {
  const MiniGamesApp({super.key});

  @override
  Widget build(BuildContext context) {
    // Orientation and system UI are set once in main(), not on every rebuild.
    return MaterialApp(
      title: 'Mini-Games Swipe',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.light,
        scaffoldBackgroundColor: const Color(0xFFF8F6F0),
        colorScheme: const ColorScheme.light(
          primary: Color(0xFF2563EB),
          secondary: Color(0xFF0D9488),
          surface: Color(0xFFFFFFFF),
        ),
        fontFamily: 'Roboto',
      ),
      home: const FeedScreen(),
    );
  }
}
