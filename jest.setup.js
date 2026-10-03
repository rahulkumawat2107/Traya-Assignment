const { configure } = require('@testing-library/react-native');

// Component tests run real SQL and real React Query; give them room when the
// whole suite runs in parallel.
configure({ asyncUtilTimeout: 5000 });
