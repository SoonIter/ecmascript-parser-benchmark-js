declare module "babel-plugin-styled-components" {
  import type { PluginTarget } from "@babel/core";

  const plugin: PluginTarget<object>;
  export default plugin;
}
