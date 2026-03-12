// Mock for dompurify — passes through but tracks hook calls
const hooks: Record<string, Function[]> = {};
const dompurify = {
  sanitize: (html: string, _opts?: any) => html,
  addHook: (name: string, fn: Function) => {
    if (!hooks[name]) hooks[name] = [];
    hooks[name].push(fn);
  },
  removeHook: (name: string) => {
    delete hooks[name];
  },
};
export default dompurify;
