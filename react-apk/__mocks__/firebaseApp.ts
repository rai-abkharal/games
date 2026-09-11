/** In-memory stand-in for @react-native-firebase/app used by unit tests. */
const mockApp = {
  name: '[DEFAULT]',
  options: {},
};

const firebase = {
  app: () => mockApp,
  apps: [mockApp],
  initializeApp: () => mockApp,
};

export default firebase;
