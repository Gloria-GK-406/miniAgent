export interface Store {
  readFile(path: string): Promise<string>;
  writeFile(path: string, data: string): Promise<void>;
  writeJsonTo<T>(path: string, data: T): Promise<void>;
  readJsonFrom<T>(path: string): Promise<T>;
  appendFile(path: string, data: string): Promise<void>;
}
