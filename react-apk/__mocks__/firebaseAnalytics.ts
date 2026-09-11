/** In-memory stand-in for @react-native-firebase/analytics used by unit tests. */
export const loggedEvents: Array<{ name: string; params?: Record<string, any> }> = [];
export const userProperties: Record<string, string | null> = {};
let currentUserId: string | null = null;
let collectionEnabled = true;

const mockAnalyticsInstance = {
  logEvent: jest.fn(async (name: string, params?: Record<string, any>) => {
    loggedEvents.push({ name, params });
  }),
  setUserId: jest.fn(async (id: string | null) => {
    currentUserId = id;
  }),
  setUserProperty: jest.fn(async (name: string, value: string | null) => {
    userProperties[name] = value;
  }),
  setUserProperties: jest.fn(async (props: Record<string, string | null>) => {
    Object.assign(userProperties, props);
  }),
  setAnalyticsCollectionEnabled: jest.fn(async (enabled: boolean) => {
    collectionEnabled = enabled;
  }),
  resetAnalyticsData: jest.fn(async () => {
    loggedEvents.length = 0;
  }),
  getAppInstanceId: jest.fn(async () => 'mock-instance-id'),
};

export const getAnalytics = jest.fn(() => mockAnalyticsInstance);

const analytics = () => mockAnalyticsInstance;
analytics.firebase = {
  apps: [{ name: '[DEFAULT]' }],
};

export default analytics;
