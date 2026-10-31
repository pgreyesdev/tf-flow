import { render, screen } from "@testing-library/react";

import { parseBlocks, RichText } from "@/components/rich-text";

describe("RichText", () => {
  it("turns the assistant's Markdown into formatted text", () => {
    const { container } = render(
      <RichText
        text={
          "Depende de **desde dónde sales**.\nDime *tu punto de salida*.\n\n## Horas\n- Antes de las `07:00`\n- Después de las __9:30__\n\n1. Uno\n2) Dos"
        }
      />,
    );
    expect(screen.getByText("desde dónde sales").tagName).toBe("STRONG");
    expect(screen.getByText("tu punto de salida").tagName).toBe("EM");
    expect(screen.getByText("07:00").tagName).toBe("CODE");
    expect(screen.getByText("9:30").tagName).toBe("STRONG");
    expect(screen.getByText("Horas").tagName).toBe("STRONG");
    expect(container.querySelectorAll("ul > li")).toHaveLength(2);
    expect(container.querySelectorAll("ol > li")).toHaveLength(2);
    expect(container.querySelectorAll("br")).toHaveLength(1);
    expect(container.textContent).not.toContain("*");
  });

  it("never renders the model's text as HTML", () => {
    const { container } = render(<RichText text={'<img src=x onerror="alert(1)"> **hola**'} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container).toHaveTextContent('<img src=x onerror="alert(1)"> hola');
  });

  it("keeps lone asterisks and maths as plain text", () => {
    expect(parseBlocks("3 * 4 = 12")).toEqual([{ kind: "paragraph", lines: ["3 * 4 = 12"] }]);
    const { container } = render(<RichText text="3 * 4 = 12" />);
    expect(container.querySelector("em")).toBeNull();
  });
});
