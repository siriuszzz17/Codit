-- ==============================================================================
-- Codit (TCC-Codit) — Correção de enunciados (quebras de linha reais) e
-- precisão numérica IEEE 754 na lição funcoes-e-calculos
-- ==============================================================================

BEGIN;

-- 1. Converte sequências literais '\n' em quebras de linha reais nos enunciados
UPDATE public.lessons
SET
  content_md = REPLACE(content_md, E'\\n', E'\n'),
  updated_at = NOW()
WHERE content_md LIKE E'%\\n%';

-- 2. Corrige solução oficial e regra da lição funcoes-e-calculos (IEEE 754: 49.9 * 0.85)
UPDATE public.lessons
SET
  content_md = E'### Desafio\nImplemente `aplicarDesconto(preco, percentual)` que retorna o preço final após aplicar o desconto.\n\n### Regras\n- Arredonde o resultado para 2 casas decimais como número (`Math.round((valor + Number.EPSILON) * 100) / 100`).\n- Se `percentual` for menor que `0`, trate como `0`. Se for maior que `100`, trate como `100`.',
  solution_code = E'function aplicarDesconto(preco, percentual) {\n  const taxa = Math.min(100, Math.max(0, percentual));\n  const final = preco * (1 - taxa / 100);\n  return Math.round((final + Number.EPSILON) * 100) / 100;\n}\n',
  updated_at = NOW()
WHERE slug = 'funcoes-e-calculos';

COMMIT;
