# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# ---------------------------------------------------------------------------
# These rules are inert while `enableProguardInReleaseBuilds` is false in
# app/build.gradle, which it is today. They are here so that turning it on —
# for a smaller store listing, say — cannot quietly take analytics out with it.
# Shrinking breaks Firebase in a way that is invisible from the outside: the
# app runs, events are logged, and nothing arrives, because a class the SDK
# looks up reflectively was renamed. That failure mode is the whole reason
# these belong in the repository rather than in a release checklist.
# ---------------------------------------------------------------------------

# Firebase and the Google Measurement SDK underneath it. Both resolve classes
# reflectively during initialisation.
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.measurement.** { *; }
-keep class com.google.android.gms.internal.measurement.** { *; }
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**

# react-native-firebase reaches its native modules from JavaScript by name.
-keep class io.invertase.firebase.** { *; }
-dontwarn io.invertase.firebase.**

# The on-device game store. `GameBundleModule` is instantiated by name through
# the React package list and its @ReactMethod entry points are called from
# JavaScript, so neither the class nor its methods may be renamed.
-keep class com.swipeplay.app.bundles.** { *; }
-keepclassmembers class com.swipeplay.app.bundles.** {
  @com.facebook.react.bridge.ReactMethod <methods>;
}

# React Native's own bridge contract, for the same reason.
-keep class com.facebook.react.bridge.** { *; }
-keepclassmembers class * {
  @com.facebook.react.bridge.ReactMethod <methods>;
}

# AdMob.
-keep class com.google.android.gms.ads.** { *; }
