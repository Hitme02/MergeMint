declare module 'web3.storage' {
  export class Web3Storage {
    constructor(opts: { token: string })
    put(files: any[], opts?: any): Promise<string>
  }
  export class File {
    constructor(chunks: any[], name: string, opts?: any)
  }
}
