import pygame

from . import map as game_map

WIDTH = game_map.MAP_WIDTH * game_map.DISPLAY_TILE
HEIGHT = game_map.MAP_HEIGHT * game_map.DISPLAY_TILE

BLACK = (20, 20, 24)
GRASS = (88, 184, 71)
TALL_GRASS = (60, 156, 63)
PATH = (210, 190, 140)
WATER = (70, 120, 230)
WATER_EDGE = (120, 170, 255)
HOUSE = (196, 138, 90)
ROOF = (186, 72, 72)
SIGN = (170, 120, 60)
TREE_LIGHT = (78, 155, 76)
PLAYER_HAT = (210, 50, 60)
PLAYER_SHIRT = (45, 90, 220)
PLAYER_SKIN = (245, 214, 176)
WHITE = (245, 245, 245)

DISPLAY_TILE = game_map.DISPLAY_TILE


def init_window(title: str = "Monster Town Demo") -> tuple[pygame.Surface, pygame.time.Clock, pygame.font.Font]:
    screen = pygame.display.set_mode((WIDTH, HEIGHT))
    pygame.display.set_caption(title)
    clock = pygame.time.Clock()
    font = pygame.font.SysFont("arial", 18)
    return screen, clock, font


def draw_tile(screen: pygame.Surface, tile: str, x: int, y: int) -> None:
    rect = pygame.Rect(x, y, DISPLAY_TILE, DISPLAY_TILE)

    if tile == "G":
        pygame.draw.rect(screen, GRASS, rect)
        pygame.draw.circle(screen, TREE_LIGHT, (x + 8, y + 8), 3)
        pygame.draw.circle(screen, TREE_LIGHT, (x + 21, y + 18), 2)
    elif tile == "T":
        pygame.draw.rect(screen, GRASS, rect)
        for offset in range(4):
            blade_x = x + 5 + offset * 7
            pygame.draw.polygon(
                screen,
                TALL_GRASS,
                [(blade_x, y + 24), (blade_x + 3, y + 12), (blade_x + 6, y + 24)],
            )
    elif tile == "P":
        pygame.draw.rect(screen, PATH, rect)
        pygame.draw.circle(screen, (190, 170, 120), (x + 10, y + 10), 2)
        pygame.draw.circle(screen, (190, 170, 120), (x + 22, y + 18), 2)
    elif tile == "W":
        pygame.draw.rect(screen, WATER, rect)
        pygame.draw.line(screen, WATER_EDGE, (x, y + 6), (x + DISPLAY_TILE, y + 6), 2)
        pygame.draw.line(screen, WATER_EDGE, (x, y + 18), (x + DISPLAY_TILE, y + 18), 2)
    elif tile == "H":
        pygame.draw.rect(screen, HOUSE, rect)
        pygame.draw.rect(screen, ROOF, (x + 2, y + 2, DISPLAY_TILE - 4, DISPLAY_TILE // 2))
        pygame.draw.rect(screen, BLACK, (x + 10, y + 18, 12, 14))
    elif tile == "S":
        pygame.draw.rect(screen, PATH, rect)
        pygame.draw.rect(screen, SIGN, (x + 10, y + 8, 12, 18))
        pygame.draw.rect(screen, (230, 220, 180), (x + 8, y + 6, 16, 8))
    else:
        pygame.draw.rect(screen, BLACK, rect)


def draw_map(screen: pygame.Surface) -> None:
    for row_index, row in enumerate(game_map.MAP_DATA):
        for col_index, tile in enumerate(row):
            draw_tile(screen, tile, col_index * DISPLAY_TILE, row_index * DISPLAY_TILE)


def draw_player(screen: pygame.Surface, player: pygame.Rect, frame: int) -> None:
    pygame.draw.ellipse(screen, (0, 0, 0, 80), (player.x + 4, player.y + 26, 16, 8))

    step = 1 if frame else 0
    pygame.draw.rect(screen, (40, 40, 60), (player.x + 7, player.y + 19, 4, 9 + step))
    pygame.draw.rect(screen, (40, 40, 60), (player.x + 13, player.y + 19, 4, 9 - step))

    pygame.draw.rect(screen, PLAYER_SHIRT, (player.x + 5, player.y + 10, 14, 12), border_radius=4)

    pygame.draw.rect(screen, PLAYER_SKIN, (player.x + 6, player.y + 4, 12, 10), border_radius=4)

    pygame.draw.rect(screen, PLAYER_HAT, (player.x + 5, player.y + 1, 14, 6), border_radius=3)
    pygame.draw.rect(screen, WHITE, (player.x + 10, player.y + 3, 4, 2))

    pygame.draw.rect(screen, BLACK, (player.x + 9, player.y + 8, 2, 2))
    pygame.draw.rect(screen, BLACK, (player.x + 13, player.y + 8, 2, 2))


def draw_ui(screen: pygame.Surface, font: pygame.font.Font, in_tall_grass: bool) -> None:
    box = pygame.Rect(8, HEIGHT - 42, 190, 30)
    pygame.draw.rect(screen, WHITE, box, border_radius=8)
    pygame.draw.rect(screen, BLACK, box, 2, border_radius=8)
    text = "Walking in grass..." if in_tall_grass else "Explore the town"
    img = font.render(text, True, BLACK)
    screen.blit(img, (18, HEIGHT - 34))
