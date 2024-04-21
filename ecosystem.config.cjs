module.exports = {
  apps: [
    {
      name: "HappyScrappy",
      script: "happyScrappy.js",
      args: ["--zalando", "--amazon", "--zooplus"],
      instances: 1,
      exec_mode: "cluster",
      error_file: "logs/error.log",
      out_file: "logs/out.log",
      log_file: "logs/combined.log",
      merge_logs: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
