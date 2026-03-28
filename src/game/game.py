import pygame
import sys

# Pokémon-style inspired top-down demo
# Controls: WASD or Arrow Keys
# This is an original mini RPG-style map with simple movement and collisions.

pygame.init()

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

# Tile legend:
# W = water/wall, G = grass, T = tall grass, P = path, H = house wall, S = sign/door area

MAP_WIDTH = len(MAP_DATA[0])
MAP_HEIGHT = len(MAP_DATA)
WIDTH = MAP_WIDTH * DISPLAY_TILE
HEIGHT = MAP_HEIGHT * DISPLAY_TILE

SCREEN = pygame.display.set_mode((WIDTH, HEIGHT))
pygame.display.set_caption("Monster Town Demo")
CLOCK = pygame.time.Clock()
FONT = pygame.font.SysFont("arial", 18)

BLACK = (20, 20, 24)
GRASS = (88, 184, 71)
TALL_GRASS = (60, 156, 63)
PATH = (210, 190, 140)
WATER = (70, 120, 230)
WATER_EDGE = (120, 170, 255)
HOUSE = (196, 138, 90)
ROOF = (186, 72, 72)
SIGN = (170, 120, 60)
TREE_DARK = (45, 115, 50)
TREE_LIGHT = (78, 155, 76)
PLAYER_HAT = (210, 50, 60)
PLAYER_SHIRT = (45, 90, 220)
PLAYER_SKIN = (245, 214, 176)
WHITE = (245, 245, 245)

PLAYER_SPEED = 3
PLAYER_SIZE = 20 * SCALE // 2


def get_collision_tiles():
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


def draw_tile(tile, x, y):
    rect = pygame.Rect(x, y, DISPLAY_TILE, DISPLAY_TILE)

    if tile == "G":
        pygame.draw.rect(SCREEN, GRASS, rect)
        pygame.draw.circle(SCREEN, TREE_LIGHT, (x + 8, y + 8), 3)
        pygame.draw.circle(SCREEN, TREE_LIGHT, (x + 21, y + 18), 2)
    elif tile == "T":
        pygame.draw.rect(SCREEN, GRASS, rect)
        for offset in range(4):
            blade_x = x + 5 + offset * 7
            pygame.draw.polygon(
                SCREEN,
                TALL_GRASS,
                [(blade_x, y + 24), (blade_x + 3, y + 12), (blade_x + 6, y + 24)],
            )
    elif tile == "P":
        pygame.draw.rect(SCREEN, PATH, rect)
        pygame.draw.circle(SCREEN, (190, 170, 120), (x + 10, y + 10), 2)
        pygame.draw.circle(SCREEN, (190, 170, 120), (x + 22, y + 18), 2)
    elif tile == "W":
        pygame.draw.rect(SCREEN, WATER, rect)
        pygame.draw.line(SCREEN, WATER_EDGE, (x, y + 6), (x + DISPLAY_TILE, y + 6), 2)
        pygame.draw.line(SCREEN, WATER_EDGE, (x, y + 18), (x + DISPLAY_TILE, y + 18), 2)
    elif tile == "H":
        pygame.draw.rect(SCREEN, HOUSE, rect)
        pygame.draw.rect(SCREEN, ROOF, (x + 2, y + 2, DISPLAY_TILE - 4, DISPLAY_TILE // 2))
        pygame.draw.rect(SCREEN, BLACK, (x + 10, y + 18, 12, 14))
    elif tile == "S":
        pygame.draw.rect(SCREEN, PATH, rect)
        pygame.draw.rect(SCREEN, SIGN, (x + 10, y + 8, 12, 18))
        pygame.draw.rect(SCREEN, (230, 220, 180), (x + 8, y + 6, 16, 8))
    else:
        pygame.draw.rect(SCREEN, BLACK, rect)


def draw_map():
    for row_index, row in enumerate(MAP_DATA):
        for col_index, tile in enumerate(row):
            draw_tile(tile, col_index * DISPLAY_TILE, row_index * DISPLAY_TILE)


def move_player(player, dx, dy, walls):
    player.x += dx
    for wall in walls:
        if player.colliderect(wall):
            if dx > 0:
                player.right = wall.left
            elif dx < 0:
                player.left = wall.right

    player.y += dy
    for wall in walls:
        if player.colliderect(wall):
            if dy > 0:
                player.bottom = wall.top
            elif dy < 0:
                player.top = wall.bottom


def draw_player(player, frame):
    # Shadow
    pygame.draw.ellipse(SCREEN, (0, 0, 0, 80), (player.x + 4, player.y + 26, 16, 8))

    # Legs
    step = 1 if frame else 0
    pygame.draw.rect(SCREEN, (40, 40, 60), (player.x + 7, player.y + 19, 4, 9 + step))
    pygame.draw.rect(SCREEN, (40, 40, 60), (player.x + 13, player.y + 19, 4, 9 - step))

    # Body
    pygame.draw.rect(SCREEN, PLAYER_SHIRT, (player.x + 5, player.y + 10, 14, 12), border_radius=4)

    # Head
    pygame.draw.rect(SCREEN, PLAYER_SKIN, (player.x + 6, player.y + 4, 12, 10), border_radius=4)

    # Hat
    pygame.draw.rect(SCREEN, PLAYER_HAT, (player.x + 5, player.y + 1, 14, 6), border_radius=3)
    pygame.draw.rect(SCREEN, WHITE, (player.x + 10, player.y + 3, 4, 2))

    # Eyes
    pygame.draw.rect(SCREEN, BLACK, (player.x + 9, player.y + 8, 2, 2))
    pygame.draw.rect(SCREEN, BLACK, (player.x + 13, player.y + 8, 2, 2))


def draw_ui(in_tall_grass):
    box = pygame.Rect(8, HEIGHT - 42, 190, 30)
    pygame.draw.rect(SCREEN, WHITE, box, border_radius=8)
    pygame.draw.rect(SCREEN, BLACK, box, 2, border_radius=8)
    text = "Walking in grass..." if in_tall_grass else "Explore the town"
    img = FONT.render(text, True, BLACK)
    SCREEN.blit(img, (18, HEIGHT - 34))


def tile_at_pixel(px, py):
    col = px // DISPLAY_TILE
    row = py // DISPLAY_TILE
    if 0 <= row < MAP_HEIGHT and 0 <= col < MAP_WIDTH:
        return MAP_DATA[row][col]
    return "W"


def main():
    player = pygame.Rect(4 * DISPLAY_TILE + 16, 9 * DISPLAY_TILE + 16, 24, 30)
    walls = get_collision_tiles()
    running = True
    anim_timer = 0
    walk_frame = 0

    while running:
        CLOCK.tick(60)

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False

        keys = pygame.key.get_pressed()
        dx = 0
        dy = 0
        moving = False

        if keys[pygame.K_LEFT] or keys[pygame.K_a]:
            dx = -PLAYER_SPEED
            moving = True
        elif keys[pygame.K_RIGHT] or keys[pygame.K_d]:
            dx = PLAYER_SPEED
            moving = True

        if keys[pygame.K_UP] or keys[pygame.K_w]:
            dy = -PLAYER_SPEED
            moving = True
        elif keys[pygame.K_DOWN] or keys[pygame.K_s]:
            dy = PLAYER_SPEED
            moving = True

        move_player(player, dx, dy, walls)

        if moving:
            anim_timer += 1
            if anim_timer >= 12:
                walk_frame = 1 - walk_frame
                anim_timer = 0
        else:
            walk_frame = 0

        center_x = player.centerx
        feet_y = player.bottom - 2
        current_tile = tile_at_pixel(center_x, feet_y)
        in_tall_grass = current_tile == "T"

        SCREEN.fill(BLACK)
        draw_map()
        draw_player(player, walk_frame)
        draw_ui(in_tall_grass)
        pygame.display.flip()

    pygame.quit()
    sys.exit()


if __name__ == "__main__":
    main()
