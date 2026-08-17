import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:frontend/app/app.dart';

void main() {
  testWidgets('MiniGamesApp loads and renders without crash', (WidgetTester tester) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: MiniGamesApp(),
      ),
    );

    // Initial loading frame
    expect(find.byType(MiniGamesApp), findsOneWidget);
  });
}
