/// <reference types="vite/client" />
interface Window {
  solidflow?: {
    openDocument(): Promise<{path:string;content:string}|null>;
    chooseLinkedSource(): Promise<{grantId:string;name:string;content:string;sha256:string}|null>;
    readLinkedSource(grantId:string): Promise<{grantId:string;name:string;content:string;sha256:string}>;
    releaseLinkedSource(grantId:string): Promise<void>;
    importStep(): Promise<{name:string;data:Uint8Array}|null>;
    saveDocument(content:string,name:string,filePath?:string): Promise<string|null>;
    exportDocument(data:Uint8Array,name:string,format:'step'|'stl'|'csv'): Promise<string|null>;
  };
}
