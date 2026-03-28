import pygame

PLAYER_SPEED = 3


def move_player(player: pygame.Rect, dx: int, dy: int, walls: list[pygame.Rect]) -> None:
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


def input_velocity(keys) -> tuple[int, int, bool]:
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

    return dx, dy, moving


def step_walk_animation(
    moving: bool,
    anim_timer: int,
    walk_frame: int,
    frame_period: int = 12,
) -> tuple[int, int]:
    if moving:
        anim_timer += 1
        if anim_timer >= frame_period:
            return 0, 1 - walk_frame
        return anim_timer, walk_frame
    return 0, 0
