// jsdom lacks these Node globals, which React Router 7 needs at import time
const { TextEncoder, TextDecoder } = require('util');
Object.assign(globalThis, { TextEncoder, TextDecoder });
