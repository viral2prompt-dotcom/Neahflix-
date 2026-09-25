{ pkgs, ... }: {
  packages = [
    pkgs.nodejs_20
    pkgs.mysql80
    pkgs.redis
    pkgs.systemd
    pkgs.glib
    pkgs.nss
    pkgs.nspr
    pkgs.atk
    pkgs."at-spi2-atk"
    pkgs.cups
    pkgs.dbus
    pkgs.expat
    pkgs.libdrm
    pkgs.mesa
    pkgs.pango
    pkgs.cairo
    pkgs.xorg.libX11
    pkgs.xorg.libXcomposite
    pkgs.xorg.libXdamage
    pkgs.xorg.libXext
    pkgs.xorg.libXfixes
    pkgs.xorg.libXrandr
    pkgs.xorg.libxcb
    pkgs.libxkbcommon
    pkgs.alsa-lib
    pkgs.libpulseaudio
    pkgs.libva
    pkgs.vulkan-loader
    pkgs.gtk3
    pkgs.gdk-pixbuf
    pkgs.harfbuzz
    pkgs.freetype
    pkgs.fontconfig
    pkgs.libpng
    pkgs.libjpeg
    pkgs.libwebp
    pkgs.libxml2
    pkgs.libxslt
    pkgs.zlib
    pkgs.bzip2
    pkgs.xorg.libXi
    pkgs.xorg.libXcursor
    pkgs.xorg.libXinerama
    pkgs.xorg.libXtst
    pkgs.xorg.libXrender
    pkgs.xorg.libXScrnSaver
  ];

  idx.previews = {
    enable = true;
    previews = {
      web = {
      command = [
        "sh"
        "-c"
        "npm run build && PORT=$PORT npm run start"
      ];
      manager = "web";
        cwd = ".";
      };
    };
  };
}
