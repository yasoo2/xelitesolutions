module.exports = {
  apps: [
    {
      name: 'joe-api',
      script: 'dist/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      out_file: './logs/api-out.log',
      error_file: './logs/api-error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm Z'
    }
  ]
};
