# Tile map: ASCII rows. W = water/wall, G = grass, T = tall grass, P = path,
# H = house wall, S = sign/door area

import pygame

TILE_SIZE = 32
SCALE = 2
DISPLAY_TILE = TILE_SIZE * SCALE

MAP_DATA = [
    "WWWWWWWWWWWWWWWWWWWW",
    "WGGGGGGGGGGGGGGGGGGW",
    "WGTTTTTTGGGGGGGGGGGW",
    "WGTTTTTTGGGFFFFFGGGW",
    "WGGGGGGGGGGFFFFFGGGW",
    "WGGPPPPPPPGGFFFFFGGW",
    "WGGPHHHHPPGGGGGGGGGW",
    "WGGPHSSHPPGGGTTTTGGW",
    "WGGPHHHHPPGGGTTTTGGW",
    "WGGPPPPPPPGGGGGGGGGW",
    "WGGGGGGGGGGGGGGGGGGW",
    "WGGGGGTTTTTTTTGGGGGW",
    "WGGGGGTTTTTTTTGGGGGW",
    "WGGGGGGGGGGGGGGGGGGW",
    "WGGGGGGGGGGGGGGGGGGW",
    "WWWWWWWWWWWWWWWWWWWW",
]

MAP_WIDTH = len(MAP_DATA[0])
MAP_HEIGHT = len(MAP_DATA)


def tile_at_pixel(px: float, py: float) -> str:
    col = int(px // DISPLAY_TILE)
    row = int(py // DISPLAY_TILE)
    if 0 <= row < MAP_HEIGHT and 0 <= col < MAP_WIDTH:
        return MAP_DATA[row][col]
    return "W"


def collision_rects() -> list[pygame.Rect]:
    walls = []
    for row_index, row in enumerate(MAP_DATA):
        for col_index, tile in enumerate(row):
            if tile in {"W", "H", "S"}:
                walls.append(
                    pygame.Rect(
                        col_index * DISPLAY_TILE,
                        row_index * DISPLAY_TILE,
                        DISPLAY_TILE,
                        DISPLAY_TILE,
                    )
                )
    return walls
