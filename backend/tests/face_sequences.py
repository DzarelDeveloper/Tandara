import numpy as np


def natural_face(step=0, *, offset=0, scale=1):
    """Synthetic landmarks, not evidence of real-camera anti-spoof accuracy."""
    points = np.array([[30, 30], [70, 30], [50 + step * .8, 50],
                       [36 - step * .4, 70], [64 + step * .4, 70]], dtype=np.float32)
    points = points * scale + [offset, 0]
    return np.array([10 * scale + offset, 10 * scale, 80 * scale, 90 * scale,
                     *points.reshape(-1), .99], dtype=np.float32)
