module.exports = {
  preset: '@react-native/jest-preset',
  testTimeout: 15000,
  testPathIgnorePatterns: ['/node_modules/', '/android/'],
  moduleNameMapper: {
    '^@react-native-async-storage/async-storage$': '<rootDir>/__mocks__/asyncStorage.ts',
    '^@react-native-firebase/app$': '<rootDir>/__mocks__/firebaseApp.ts',
    '^@react-native-firebase/analytics$': '<rootDir>/__mocks__/firebaseAnalytics.ts',
  },
};
