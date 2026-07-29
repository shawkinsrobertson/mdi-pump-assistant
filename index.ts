// Must run before any oref-vendor code does — see the file for why.
import './lib/oref-vendor/polyfillProcessStreams';

// Side-effect import: registers the background insight-generation task
// definition (TaskManager.defineTask) unconditionally at module load, so
// it's ready before the OS can invoke it in a headless JS context — one
// where App.tsx's component tree never mounts. Actually scheduling it
// with the OS (registerInsightTask()) happens separately, from App.tsx,
// once the app is actually opened.
import './lib/tasks/insightTask';

import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
