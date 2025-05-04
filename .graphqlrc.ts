import { ApiType, shopifyApiProject } from "@shopify/api-codegen-preset";

export default {
  schema: "https://shopify.dev/admin-graphql-direct-proxy",
  documents: ["*.ts", "!node_modules"],
  projects: {
    default: shopifyApiProject({
      apiType: ApiType.Admin,
      apiVersion: "2023-10",
      outputDir: "./types",
    }),
  },
};
