export default [
  {
    files: ['**/*.js'],
    ignores: ['node_modules/**', 'public/pixi*.js', 'public/idb.js', 'backup_*.js', 'test_*.js', 'fill_*.js', 'analyze_*.js', 'big_*.sql', 'batch*.sql', 'batch*.json', '*.sh'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        PIXI: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        localStorage: 'readonly',
        URLSearchParams: 'readonly',
        location: 'readonly',
        navigator: 'readonly',
        performance: 'readonly',
        URL: 'readonly',
        Response: 'readonly',
        self: 'readonly',
        caches: 'readonly',
        XMLSerializer: 'readonly',
        module: 'readonly',
        require: 'readonly',
        Blob: 'readonly',
        Worker: 'readonly',
        btoa: 'readonly',
        atob: 'readonly',
        requestAnimationFrame: 'readonly',
        getComputedStyle: 'readonly',
        pixelData: 'readonly',
        confirm: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': 'warn',
      'no-undef': 'error',
      'no-console': 'off',
      'semi': 'off',
      'quotes': 'off'
    }
  }
];