# Matriz de permissões

A matriz fica no banco (`permissoes_papel`) e o administrador da plataforma a edita em **Plataforma → Matriz de permissões**. A tabela abaixo é a configuração inicial.

Toda permissão vale **dentro do órgão e da unidade do vínculo** (incluindo as unidades abaixo dela).

Legenda: L = ler · C = criar · E = editar · X = excluir/inativar · A = aprovar · P = exportar/imprimir

| Módulo | Master | Gestão Municipal | Secretário | Diretoria | Coordenador | Administrativo | Servidor |
|---|---|---|---|---|---|---|---|
| Estrutura organizacional | L C E X A P | L P | L P | L P | L P | L | L |
| Usuários e vínculos | L C E X A P | L P | L P | L P | L P | L C E X | — |
| Configurações e identidade | L C E X A P | — | — | — | — | — | — |
| Auditoria | L C E X A P | — | — | — | — | — | — |
| Fornecedores, servidores, unidades atendidas | L C E X A P | L P | L P | L P | L P | L C E X P | — |
| Servidores: dados pessoais (CPF, nascimento, mãe, tipo sanguíneo, endereço) | L C E P | — | — | — | — | L C E | só os próprios |
| Classificação orçamentária (catálogo do município, escrita só pela plataforma) | L P | L P | L P | L P | L P | L P | L |
| Tipos de serviço | L C E X A P | L P | L P | L P | L P | L C E | — |
| Contratos, empenhos, notas fiscais, OS | L C E X A P | L P | L P | L P | L P | L C E X P | — |
| Consulta e relatórios | L C E X A P | L P | L P | L P | L P | L P | — |

Observações sobre a tabela:
- "Atestar" não é concedido pela matriz a ninguém. Na Fase 3, virá da designação de gestor, fiscal ou suplente em cada contrato, e valerá só para aquele contrato.
- O papel Servidor edita o próprio perfil por regras específicas, não pela matriz.

## Quem concede o quê (`papel_concede`)

| Concedente | Pode conceder |
|---|---|
| Plataforma | qualquer papel, inclusive Master |
| Master | todos, exceto Master |
| Administrativo | Administrativo e Servidor, dentro da própria unidade |

Regras gerais:
- Ninguém altera os próprios acessos.
- Suspender um acesso exige motivo, e o motivo vai para a auditoria.

## Escopos

| Papel | Escopo típico | Observação |
|---|---|---|
| Master | órgão inteiro ou uma Secretaria | administra a estrutura, os usuários e a identidade |
| Gestão Municipal | órgão inteiro | consulta várias Secretarias |
| Secretário | Secretaria | consulta as Diretorias |
| Diretoria | Diretoria | consulta as Coordenações |
| Coordenador | Coordenação | consulta; pode ser gestor ou fiscal por designação |
| Administrativo | Coordenação | opera os cadastros e a execução |
| Servidor | unidade de lotação | o próprio perfil |

## Administrador da plataforma

- Administra órgãos, estrutura, usuários, configurações e a matriz.
- Só vê dados operacionais de um órgão com uma **sessão de suporte**, que exige:
  - motivo de pelo menos 10 caracteres;
  - prazo de 5 minutos a 8 horas.
- A sessão e tudo o que for feito nela aparecem na auditoria do órgão, marcados como "suporte".
