// expect: no-console
export const leak = (password: string) => console.log(password);
