/// <reference types="vite/client" />
interface Window {
  solidflow?: {
    openDocument(): Promise<{path:string;content:string}|null>;
    saveDocument(content:string,name:string,filePath?:string): Promise<string|null>;
    exportDocument(data:Uint8Array,name:string,format:'step'|'stl'): Promise<string|null>;
  };
}
