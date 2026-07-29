/** Ambient types when keytar is optional / not installed. */
declare module 'keytar' {
  export function getPassword(
    service: string,
    account: string,
  ): Promise<string | null>;
  export function setPassword(
    service: string,
    account: string,
    password: string,
  ): Promise<void>;
  export function deletePassword(
    service: string,
    account: string,
  ): Promise<boolean>;
  export function findCredentials(
    service: string,
  ): Promise<Array<{ account: string; password: string }>>;

  const keytar: {
    getPassword: typeof getPassword;
    setPassword: typeof setPassword;
    deletePassword: typeof deletePassword;
    findCredentials: typeof findCredentials;
  };
  export default keytar;
}
