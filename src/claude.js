import Anthropic from '@anthropic-ai/sdk';
import { config, verificarApiKey } from './config.js';

let cliente = null;

function obtenerCliente() {
  verificarApiKey();
  if (!cliente) cliente = new Anthropic({ apiKey: config.apiKey });
  return cliente;
}

/** Saca el primer objeto JSON de un texto (por si Claude agrega algo alrededor). */
export function extraerJSON(texto) {
  const limpio = texto.replace(/```json|```/g, '');
  const inicio = limpio.indexOf('{');
  const fin = limpio.lastIndexOf('}');
  if (inicio === -1 || fin === -1) throw new Error('Claude no devolvió JSON válido.');
  return JSON.parse(limpio.slice(inicio, fin + 1));
}

/**
 * Le pide algo a Claude y espera un JSON como respuesta.
 * @param {string} sistema instrucciones de rol
 * @param {string} mensaje contenido
 */
export async function pedirJSON(sistema, mensaje, maxTokens = 4000) {
  const respuesta = await obtenerCliente().messages.create({
    model: config.modeloClaude,
    max_tokens: maxTokens,
    system: sistema,
    messages: [{ role: 'user', content: mensaje }],
  });

  const texto = respuesta.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  return extraerJSON(texto);
}
