# Memory Flip - Testing Checklist

- [x] **Card Flip Animations**: Smooth horizontal scale tween simulating authentic card reveal.
- [x] **Match Logic**: Accurately pairs matching symbols; automatically flips back mismatched pairs after brief delay.
- [x] **Score & Penalty Algorithm**: Rewarding fast recall and low move count.
- [x] **Game Completed Event**: Sends `GameBridge.completed` with metrics to host Flutter app.
- [x] **State Retention & Pause**: Timers pause when WebView is swiped away.
