export function capitalize(word) {
  if (!word) return ""; // Devuelve una cadena vacía si la entrada es nula o indefinida
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}
