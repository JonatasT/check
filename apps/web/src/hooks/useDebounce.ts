// apps/web/src/hooks/useDebounce.ts
import { useState, useEffect } from 'react';

export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // Define um timer para atualizar o valor debounceado após o delay
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Limpa o timer se o valor mudar (ou o delay)
    // Isso garante que se o usuário continuar digitando, o valor só será atualizado após ele parar
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]); // Só re-executa o efeito se o valor ou o delay mudarem

  return debouncedValue;
}
