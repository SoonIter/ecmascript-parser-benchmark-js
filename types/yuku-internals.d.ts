declare module "yuku-parser/binding.js" {
  import type { ParseOptions } from "yuku-parser";

  interface ParserBinding {
    parse(source: Uint8Array, options: ParseOptions): ArrayBuffer;
  }

  const binding: ParserBinding;
  export default binding;
}

declare module "yuku-parser/decode.js" {
  import type { ParseResult } from "yuku-parser";

  export function decode(buffer: ArrayBuffer, source: string | Uint8Array): ParseResult;
}

declare module "yuku-codegen/binding.js" {
  import type { GenerateOptions, GenerateResult } from "yuku-codegen";

  interface CodegenBinding {
    generate(buffer: ArrayBuffer, options: GenerateOptions): GenerateResult;
  }

  const binding: CodegenBinding;
  export default binding;
}

declare module "yuku-codegen/encode.js" {
  import type { Program } from "yuku-parser";

  export function encode(program: Program): ArrayBuffer;
}
