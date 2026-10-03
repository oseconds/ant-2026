export const SPHERE_MATERIALS = Object.freeze({
  stainless304: Object.freeze({ name: 'Stainless 304', density: 8000, youngModulus: 193e9, poisson: .29, color: [.63, .69, .73] }),
  carbon1045: Object.freeze({ name: 'Carbon steel 1045', density: 7850, youngModulus: 205e9, poisson: .29, color: [.43, .50, .57] }),
  aluminum6061: Object.freeze({ name: 'Aluminum 6061-T6', density: 2700, youngModulus: 69e9, poisson: .33, color: [.72, .75, .77] }),
  brassC260: Object.freeze({ name: 'Brass C260', density: 8530, youngModulus: 110e9, poisson: .375, color: [.73, .49, .19] })
});

export function sphereMaterial(key) {
  return SPHERE_MATERIALS[key] || SPHERE_MATERIALS.stainless304;
}
