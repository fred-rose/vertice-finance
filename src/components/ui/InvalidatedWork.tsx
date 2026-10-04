import { useState } from "react";
export function InvalidatedWork({
  label,
  text,
  onDiscard,
}: {
  label: string;
  text: string;
  onDiscard: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  return (
    <section
      className="panel settings-section"
      aria-label={`Edição invalidada: ${label}`}
    >
      <h2>{label} — edição não salva</h2>
      <p>
        Não salvo — edição anterior à recuperação/restauração. Disponível
        somente para consulta e cópia. Descarte para abrir uma nova edição.
      </p>
      <textarea
        aria-label={`Conteúdo não salvo: ${label}`}
        readOnly
        value={text}
        rows={10}
        style={{ width: "100%" }}
      />
      {confirm ? (
        <div role="group" aria-label="Confirmar descarte">
          <p>Há alterações não salvas.</p>
          <button
            className="secondary-button"
            onClick={() => setConfirm(false)}
          >
            Continuar consultando
          </button>
          <button className="danger-button" onClick={onDiscard}>
            Descartar e fechar
          </button>
        </div>
      ) : (
        <button className="secondary-button" onClick={() => setConfirm(true)}>
          Descartar edição
        </button>
      )}
    </section>
  );
}
