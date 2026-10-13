import { describe, expect, it, vi } from "vitest";
import { moveToEdge, moveInList } from "@/features/admin/galleryOrder";

describe("moveToEdge", () => {
  it("monte d'autant de places qu'il faut pour arriver en premier", async () => {
    const move = vi.fn(async () => true);
    expect(await moveToEdge("p", 3, "up", move)).toBe(3);
    expect(move).toHaveBeenCalledTimes(3);
    expect(move).toHaveBeenCalledWith("p", "up");
  });

  it("s'arrête dès que la base répond « déjà au bout » (liste changée entre-temps)", async () => {
    const move = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await moveToEdge("p", 5, "down", move)).toBe(1);
    expect(move).toHaveBeenCalledTimes(2);
  });

  it("déjà en place : aucun appel", async () => {
    const move = vi.fn(async () => true);
    expect(await moveToEdge("p", 0, "up", move)).toBe(0);
    expect(move).not.toHaveBeenCalled();
  });
});

describe("moveInList", () => {
  const list = ["a", "b", "c", "d"];

  it("déplace un élément à une position donnée, sans modifier la liste d'origine", () => {
    expect(moveInList(list, 3, 0)).toEqual(["d", "a", "b", "c"]);
    expect(moveInList(list, 0, 3)).toEqual(["b", "c", "d", "a"]);
    expect(moveInList(list, 1, 2)).toEqual(["a", "c", "b", "d"]);
    expect(list).toEqual(["a", "b", "c", "d"]);
  });
});
