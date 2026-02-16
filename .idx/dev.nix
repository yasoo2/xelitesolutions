# To learn more about how to use Nix to configure your environment
# see: https://firebase.google.com/docs/studio/customize-workspace
{ pkgs, ... }: {
  # Which nixpkgs channel to use.
  channel = "stable-24.05"; # or "unstable"

  # Use https://search.nixos.org/packages to find packages
  packages = [
    # pkgs.go
    # pkgs.python311
    # pkgs.python311Packages.pip
    pkgs.nodejs_20
    # pkgs.nodePackages.nodemon
    pkgs.docker
    pkgs.docker-compose
  ];

  # Sets environment variables in the workspace
  env = {};
  idx = {
    # Search for the extensions you want on https://open-vsx.org/ and use "publisher.id"
    extensions = [
      # "username.extension"
    ];

    # Enable previews and customize configuration
    previews = {
      enable = true;
      previews = [
        {
          # The name that shows up in the UI
          id = "web";
          # Command to start your app
          command = ["npm", "run", "dev", "--", "--port", "$PORT", "--host", "0.0.0.0"];
          # The port your app is listening on
          port = 8080;
          # "private" means the preview is only visible to you.
          # "public" means the preview can be seen by anyone with the link.
          visibility = "private";
        }
      ];
    };
  };
}
