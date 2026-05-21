const global = globalThis || this || self;

const process = {
  env: {
    ...import.meta.env,
    NODE_ENV: import.meta.env.DEV ? 'development' : 'production',
    PUBLIC_URL: import.meta.env.BASE_URL.slice(0, -1),
    // Direct reference so Rolldown can statically inline the value via define
    REACT_APP_BACKEND_WORKER_HASH: import.meta.env
      .REACT_APP_BACKEND_WORKER_HASH,
  },
};

export { process };

export { global };
