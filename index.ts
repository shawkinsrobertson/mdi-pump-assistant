// Must run before any oref-vendor code does — see the file for why.
import './lib/oref-vendor/polyfillProcessStreams';

import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
