/* eslint-disable @typescript-eslint/no-require-imports */
const path = require("node:path");

const iconBase = path.join(__dirname, "assets", "icon");

module.exports = {
  packagerConfig: {
    asar: true,
    icon: iconBase,
    executableName: "Naizai",
    appBundleId: "com.naizai.desktop",
    appCategoryType: "public.app-category.utilities",
  },
  makers: [
    {
      name: "@electron-forge/maker-squirrel",
      platforms: ["win32"],
      config: {
        name: "naizai",
        setupExe: "Naizai-Setup.exe",
        setupIcon: `${iconBase}.ico`,
        iconUrl: "https://raw.githubusercontent.com/wangxianda941030/cloudpet/main/desktop/assets/icon.ico",
      },
    },
    {
      name: "@electron-forge/maker-dmg",
      platforms: ["darwin"],
      config: (arch) => ({
        name: `Naizai-${arch}`,
        icon: `${iconBase}.icns`,
        format: "ULFO",
      }),
    },
    {
      name: "@electron-forge/maker-zip",
      platforms: ["darwin"],
      config: {},
    },
  ],
};
